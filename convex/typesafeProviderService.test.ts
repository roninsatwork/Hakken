import { describe, expect, test, vi } from "vitest";
import {
  askTypesafe,
  boundedFetch,
  buildTypesafeProviderConfig,
  listTypesafeModels,
  parseTypesafeAnswer,
  TYPESAFE_TIMEOUT_MS,
  type TypesafeQuestion,
} from "./typesafeProviderService";

type FetchStub = (_: RequestInfo | URL, __?: RequestInit) => Promise<Response>;

const systemOneBody = {
  model: "jev-latest",
  answers: {
    kind: {
      type: "choice",
      choice: "customer",
      probabilities: { customer: 0.84, newsletter: 0.15, spam: 0.01 },
      confidence: 0.6,
    },
    urgent: { type: "noul", noul: 0.92 },
    mood: {
      type: "score",
      score: 1.4,
      legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
      probabilities: { "0": 0.1, "1": 0.4, "2": 0.5 },
      confidence: 0.55,
    },
  },
  usage: { input_tokens: 312, output_tokens: 48 },
};

describe("typesafe provider service", () => {
  test("refuses to build without the key, naming it", () => {
    expect(() => buildTypesafeProviderConfig({ env: {} })).toThrow(/TYPESAFE_API_KEY/);
  });

  test("asks every question in one request and returns typed answers with usage", async () => {
    const fetchImpl = vi.fn<FetchStub>(async () =>
      new Response(JSON.stringify(systemOneBody), { status: 200 }),
    );

    const result = await askTypesafe({
      env: { TYPESAFE_API_KEY: "key" },
      fetchImpl,
      model: "jev-latest",
      state: { message: "Help! My payouts have been failing for 3 days." },
      questions: {
        kind: {
          type: "choice",
          instructions: "What kind of message is this?",
          criteria: { customer: "A customer asking for something", newsletter: null, spam: null },
        },
        urgent: { type: "noul", instructions: "Does this message express urgency?" },
        mood: { type: "score", instructions: "How frustrated is the sender?", criteria: ["Calm", "Frustrated", "Very angry"] },
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("jev-latest");
    expect(body.state).toEqual({ message: "Help! My payouts have been failing for 3 days." });
    expect(Object.keys(body.questions)).toEqual(["kind", "urgent", "mood"]);

    expect(result.model).toBe("jev-latest");
    expect(result.usage).toEqual({ inputTokens: 312, outputTokens: 48 });
    expect(result.answers.kind).toEqual({
      type: "choice",
      choice: "customer",
      probabilities: { customer: 0.84, newsletter: 0.15, spam: 0.01 },
      confidence: 0.6,
    });
    expect(result.answers.urgent).toEqual({ type: "noul", noul: 0.92 });
    expect(result.answers.mood).toMatchObject({ type: "score", score: 1.4, confidence: 0.55 });
  });

  test("retries an overloaded (529) reply and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<FetchStub>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "overloaded" }), { status: 529 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(systemOneBody), { status: 200 }));

      const resultPromise = askTypesafe({
        env: { TYPESAFE_API_KEY: "key" },
        fetchImpl,
        model: "jev-latest",
        state: "Hello",
        questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toMatchObject({ answers: { urgent: { noul: 0.92 } } });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not retry a rejected request body (422)", async () => {
    const fetchImpl = vi.fn<FetchStub>(async () =>
      new Response(JSON.stringify({ error: "questions.urgent.type is invalid" }), { status: 422 }),
    );

    await expect(askTypesafe({
      env: { TYPESAFE_API_KEY: "key" },
      fetchImpl,
      model: "jev-latest",
      state: "Hello",
      questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
    })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a missing answer is an upstream failure, not a silent gap", async () => {
    const fetchImpl = vi.fn<FetchStub>(async () =>
      new Response(JSON.stringify({ model: "jev-latest", answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }),
    );

    await expect(askTypesafe({
      env: { TYPESAFE_API_KEY: "key" },
      fetchImpl,
      model: "jev-latest",
      state: "Hello",
      questions: { urgent: { type: "noul", instructions: "Is this urgent?" } },
    })).rejects.toThrow(/no answer for 'urgent'/);
  });

  test("an answer with no probability is rejected rather than passed through", () => {
    expect(() => parseTypesafeAnswer("kind", { type: "choice", choice: "customer" })).toThrow(/probability per option/);
    expect(() => parseTypesafeAnswer("urgent", { type: "noul" })).toThrow(/yes\/no probability/);
    expect(() => parseTypesafeAnswer("odd", { type: "poem" })).toThrow(/unknown type 'poem'/);
  });

  test("lists the models the key can see from GET /v1/models", async () => {
    const fetchImpl = vi.fn<FetchStub>(async () =>
      new Response(JSON.stringify({
        models: [
          { name: "jev-latest", description: "Flagship System One model", release_date: "2026-06-01" },
          { name: "" },
          { description: "no name at all" },
        ],
      }), { status: 200 }),
    );

    const models = await listTypesafeModels({ env: { TYPESAFE_API_KEY: "key" }, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.typesafe.ai/v1/models");
    expect(init?.method).toBe("GET");
    expect(models).toEqual([
      { id: "jev-latest", description: "Flagship System One model", releaseDate: "2026-06-01" },
    ]);
  });

  test("an answer is checked against its question: ranges, options, sums and scale (review, 2026-09-18)", () => {
    const kind: TypesafeQuestion = { type: "choice", instructions: "Kind?", criteria: { customer: null, spam: null, other: null } };
    const mood: TypesafeQuestion = { type: "score", instructions: "Mood?", criteria: ["Calm", "Cross", "Furious"] };
    const urgent: TypesafeQuestion = { type: "noul", instructions: "Urgent?" };
    expect(() => parseTypesafeAnswer("urgent", { type: "noul", noul: -1 }, urgent)).toThrow(/outside 0 to 1/);
    expect(() => parseTypesafeAnswer("urgent", { type: "noul", noul: 1.5 }, urgent)).toThrow(/outside 0 to 1/);
    expect(() => parseTypesafeAnswer("urgent", { type: "choice", choice: "x", probabilities: { x: 1 }, confidence: 1 }, urgent)).toThrow(/not the 'noul' one asked/);
    expect(() => parseTypesafeAnswer("kind", { type: "choice", choice: "junk", probabilities: { customer: 0.5, spam: 0.4, other: 0.1 }, confidence: 0.3 }, kind)).toThrow(/not an option/);
    expect(() => parseTypesafeAnswer("kind", { type: "choice", choice: "spam", probabilities: { customer: 0.5, spam: 0.5 }, confidence: 0.3 }, kind)).toThrow(/missing a probability/);
    expect(() => parseTypesafeAnswer("kind", { type: "choice", choice: "spam", probabilities: { customer: 0.5, spam: 0.5, other: 0.5 }, confidence: 0.3 }, kind)).toThrow(/do not sum to one/);
    expect(() => parseTypesafeAnswer("kind", { type: "choice", choice: "spam", probabilities: { customer: 0.2, spam: 0.7, other: 0.1, bonus: 0 }, confidence: 0.3 }, kind)).toThrow(/not an option/);
    expect(() => parseTypesafeAnswer("mood", { type: "score", score: 7, legend: { "0": "a" }, probabilities: { "0": 0.2, "1": 0.3, "2": 0.5 }, confidence: 0.4 }, mood)).toThrow(/off the scale/);
    expect(parseTypesafeAnswer("kind", { type: "choice", choice: "spam", probabilities: { customer: 0.2, spam: 0.7, other: 0.1 }, confidence: 0.5 }, kind))
      .toMatchObject({ type: "choice", choice: "spam" });
  });

  test("a reply past the size cap is refused while it is still arriving, and every request carries a timeout", async () => {
    const big = "x".repeat(300 * 1024);
    const chunked = vi.fn<FetchStub>(async () => new Response(new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(big);
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024) controller.enqueue(bytes.slice(offset, offset + 64 * 1024));
        controller.close();
      },
    }), { status: 200 }));
    await expect(boundedFetch(chunked)("https://api.typesafe.ai/v1/systemone", {})).rejects.toThrow(/too large/);

    const declared = vi.fn<FetchStub>(async () => new Response("{}", { status: 200, headers: { "content-length": String(10 * 1024 * 1024) } }));
    await expect(boundedFetch(declared)("https://api.typesafe.ai/v1/systemone", {})).rejects.toThrow(/too large/);

    const fetchImpl = vi.fn<FetchStub>(async () => new Response(JSON.stringify(systemOneBody), { status: 200 }));
    await askTypesafe({ env: { TYPESAFE_API_KEY: "key" }, fetchImpl, model: "jev-latest", state: "Hi", questions: { urgent: { type: "noul", instructions: "Urgent?" } } });
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(TYPESAFE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
