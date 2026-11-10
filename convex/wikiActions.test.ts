import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { WIKI_PICK_TIME_LIMIT_MS, WIKI_SHORTLIST_SIZE } from "./wikiActions";

/**
 * The wiki's reading and writing roads (wiki-replaces-knowledge, stage two;
 * self-improving-wiki-plan.md, phase 1): the chooser reads names and opens
 * pages whole, the global shelf fills gaps without overruling, a dead model
 * degrades to word match rather than silence — and a rewrite that the
 * validator refuses leaves the page exactly as it stood.
 */

const { generateTextWithResolvedModelMock } = vi.hoisted(() => ({
  generateTextWithResolvedModelMock: vi.fn(),
}));

// Mocked shallow on purpose — the real module imports every provider SDK.
vi.mock("./aiProviderRegistry", () => ({
  generateTextWithResolvedModel: generateTextWithResolvedModelMock,
}));

beforeEach(() => {
  generateTextWithResolvedModelMock.mockReset();
});

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedPage(
  t: ReturnType<typeof convexTest>,
  args: {
    companyId?: Id<"companies">;
    kind: "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE";
    subjectKey: string;
    content: string;
  }
) {
  await t.mutation(internal.wikiPages.applyRewriteInternal, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    kind: args.kind,
    subjectKey: args.subjectKey,
    title: args.subjectKey,
    content: args.content,
    source: "DOCUMENT:doc-1",
  });
}

describe("choosing pages for a question", () => {
  test("the chooser's picks are opened whole — company pages first, global picks wearing their badge", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "We deliver on Fridays." });
    await seedPage(t, { kind: "POLICY", subjectKey: "billing", content: "Billing runs monthly." });

    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ pages: ["POLICY:delivery", "global/POLICY:billing"] }),
    });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "When do you deliver, and how does billing work?",
      includeCustomerPages: false,
    });

    expect(result.pageKeys).toEqual(["POLICY:delivery", "global/POLICY:billing"]);
    expect(result.context).toContain("We deliver on Fridays.");
    expect(result.context).toContain("Billing runs monthly.");
    // Picking pages runs on "Fast": unset, a model that thinks by default
    // spent most of the wait on this one pick.
    expect(generateTextWithResolvedModelMock.mock.calls[0][0].thinkingLevel).toBe("NONE");
    // The company's own shelf opens first and holds first claim on the budget.
    expect(result.context.indexOf("Fridays")).toBeLessThan(result.context.indexOf("monthly"));
  });

  test("a global page on a subject the company covers is dropped before the chooser ever sees it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "Ours: Fridays only." });
    await seedPage(t, { kind: "POLICY", subjectKey: "delivery", content: "Platform default: any day." });

    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ pages: ["POLICY:delivery"] }),
    });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "When do you deliver?",
      includeCustomerPages: false,
    });

    const indexShown = generateTextWithResolvedModelMock.mock.calls[0][0].contents[0].text as string;
    expect(indexShown).toContain("POLICY:delivery");
    expect(indexShown).not.toContain("global/POLICY:delivery");
    expect(result.context).toContain("Ours: Fridays only.");
    expect(result.context).not.toContain("any day");
  });

  test("hallucinated keys are discarded, and an empty answer is believed after one look when no documents wait", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "We deliver on Fridays." });

    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ pages: ["POLICY:invented-page"] }),
    });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "What is the meaning of life?",
      includeCustomerPages: false,
    });

    expect(result).toEqual({ context: "", pageKeys: [] });
    // No source notes exist, so there is no second index worth reading — one model call only.
    expect(generateTextWithResolvedModelMock).toHaveBeenCalledTimes(1);
  });

  test("a filed document with no synthesis is still findable on the second pass", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "We deliver on Fridays." });
    await seedPage(t, {
      companyId,
      kind: "SOURCE",
      subjectKey: "handbook-1",
      content: "The staff handbook: returns are accepted within 30 days.",
    });

    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({ text: JSON.stringify({ pages: [] }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ pages: ["SOURCE:handbook-1"] }) });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "How long do customers have to return things?",
      includeCustomerPages: false,
    });

    expect(result.pageKeys).toEqual(["SOURCE:handbook-1"]);
    expect(result.context).toContain("within 30 days");
    expect(generateTextWithResolvedModelMock).toHaveBeenCalledTimes(2);
  });

  test("when both passes read the index and find nothing, the wiki's silence is believed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "We deliver on Fridays." });
    await seedPage(t, {
      companyId,
      kind: "SOURCE",
      subjectKey: "handbook-1",
      content: "The staff handbook: returns are accepted within 30 days.",
    });

    generateTextWithResolvedModelMock.mockResolvedValue({ text: JSON.stringify({ pages: [] }) });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "What is the meaning of life?",
      includeCustomerPages: false,
    });

    expect(result).toEqual({ context: "", pageKeys: [] });
    // The filed documents earned a second look; there is no third.
    expect(generateTextWithResolvedModelMock).toHaveBeenCalledTimes(2);
  });

  test("a dead model degrades to word match across both shelves rather than silence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "Delivery goes out on Fridays." });
    await seedPage(t, { kind: "POLICY", subjectKey: "billing", content: "Billing runs monthly." });

    generateTextWithResolvedModelMock.mockRejectedValue(new Error("503 provider down"));

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "how does billing work after a delivery",
      includeCustomerPages: false,
    });

    expect(result.pageKeys).toContain("POLICY:delivery");
    expect(result.pageKeys).toContain("global/POLICY:billing");
    expect(result.context).toContain("Fridays");
    expect(result.context).toContain("monthly");
  });

  test("a model that has not chosen by the time limit is left behind, and the word match answers", async () => {
    // Elsewhere on this code the choosing alone ran to 90 seconds with nothing on screen.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "delivery", content: "Delivery goes out on Fridays." });

    generateTextWithResolvedModelMock.mockReturnValue(new Promise(() => {}));

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "when does delivery go out",
      includeCustomerPages: false,
      pickTimeLimitMs: 150,
    });

    // The model never answers, so these pages can only have come from the fallback.
    expect(result.pageKeys).toEqual(["POLICY:delivery"]);
    expect(result.context).toContain("Fridays");
  });

  test("the time limit is five seconds unless a caller says otherwise", () => {
    expect(WIKI_PICK_TIME_LIMIT_MS).toBe(5_000);
  });
});

describe("the shortlist the chooser reads", () => {
  // Elsewhere on this code a whole index (~250 entries) took the Fast Chat model
  // 50–104 seconds to read, whatever its thinking setting; a short one takes seconds.
  async function seedShelf(t: ReturnType<typeof convexTest>, companyId: Id<"companies">) {
    for (let i = 0; i < WIKI_SHORTLIST_SIZE + 10; i++) {
      await seedPage(t, { companyId, kind: "POLICY", subjectKey: `routine-${i}`, content: `Routine office procedure number ${i}.` });
    }
    await seedPage(t, { companyId, kind: "POLICY", subjectKey: "harbour-moorings", content: "Harbour moorings are booked a week ahead." });
  }

  const indexLinesShown = () =>
    (generateTextWithResolvedModelMock.mock.calls[0][0].contents[0].text as string)
      .split("Index:\n")[1]
      .split("\n")
      .filter(Boolean);

  test("a shelf past the shortlist size is narrowed by the question's words, best match first", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedShelf(t, companyId);

    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ pages: ["POLICY:harbour-moorings"] }),
    });

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "how far ahead are harbour moorings booked",
      includeCustomerPages: false,
    });

    const lines = indexLinesShown();
    expect(lines).toHaveLength(WIKI_SHORTLIST_SIZE);
    expect(lines[0]).toMatch(/^POLICY:harbour-moorings/);
    expect(result.pageKeys).toEqual(["POLICY:harbour-moorings"]);
    expect(result.context).toContain("a week ahead");
  });

  test("a question whose words reach nothing still gets a full shortlist to choose from", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedShelf(t, companyId);

    generateTextWithResolvedModelMock.mockResolvedValue({ text: JSON.stringify({ pages: [] }) });

    await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "zzz qqq",
      includeCustomerPages: false,
    });

    expect(indexLinesShown()).toHaveLength(WIKI_SHORTLIST_SIZE);
  });

  test("when the chooser is late, the search's best matches are opened", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedShelf(t, companyId);

    generateTextWithResolvedModelMock.mockReturnValue(new Promise(() => {}));

    const result = await t.action(internal.wikiActions.selectWikiContextForQuery, {
      companyId,
      query: "how far ahead are harbour moorings booked",
      includeCustomerPages: false,
      pickTimeLimitMs: 150,
    });

    expect(result.pageKeys[0]).toBe("POLICY:harbour-moorings");
    expect(result.context).toContain("a week ahead");
  });
});

describe("one event, one page, one rewrite", () => {
  const event = {
    subjectKey: "harbour-hotel",
    eventLabel: "phone call",
    source: "PHONE_CALL:call-1",
    eventText: "They asked to move to winter rates and confirmed email is best.",
  };

  async function customerPage(t: ReturnType<typeof convexTest>, companyId: Id<"companies">) {
    return await t.query(internal.wikiPages.getCustomerPageInternal, {
      companyId,
      subjectKey: event.subjectKey,
    });
  }

  test("the event lands on the customer page with its source recorded", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({ text: "Prefers email. Asked about winter rates." })
      .mockResolvedValueOnce({ text: JSON.stringify({ topics: [] }) });

    await t.action(internal.wikiActions.rewriteCustomerPageAfterEvent, { companyId, ...event });

    const page = await customerPage(t, companyId);
    expect(page?.content).toBe("Prefers email. Asked about winter rates.");
    expect(page?.lastRewriteSource).toBe("PHONE_CALL:call-1");
  });

  test("a rewrite the validator refuses leaves the page standing, and no topic pass runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "CUSTOMER", subjectKey: event.subjectKey, content: "Original notes." });

    generateTextWithResolvedModelMock.mockResolvedValue({ text: "   " });
    await t.action(internal.wikiActions.rewriteCustomerPageAfterEvent, { companyId, ...event });

    const page = await customerPage(t, companyId);
    expect(page?.content).toBe("Original notes.");
    expect(generateTextWithResolvedModelMock).toHaveBeenCalledTimes(1);
  });

  test("a dead model leaves the page exactly as it stood", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, { companyId, kind: "CUSTOMER", subjectKey: event.subjectKey, content: "Original notes." });

    generateTextWithResolvedModelMock.mockRejectedValue(new Error("503"));
    await t.action(internal.wikiActions.rewriteCustomerPageAfterEvent, { companyId, ...event });

    const page = await customerPage(t, companyId);
    expect(page?.content).toBe("Original notes.");
  });

  test("what the call taught about the COMPANY lands on a topic page, linked both ways", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({ text: "Prefers email." })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topics: [{ kind: "POLICY", slug: "Winter Rates", learned: "Winter rates start in November." }],
        }),
      })
      .mockResolvedValueOnce({ text: "Winter rates start in November." });

    await t.action(internal.wikiActions.rewriteCustomerPageAfterEvent, { companyId, ...event });

    // The slug is normalised, so "Winter Rates" and "winter-rates" are one page.
    const topicPage = await t.query(internal.wikiPages.getPageOfKindInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "winter-rates",
    });
    expect(topicPage?.content).toBe("Winter rates start in November.");

    const customer = await customerPage(t, companyId);
    expect(customer?.links).toContain("POLICY:winter-rates");
    expect(topicPage?.links).toContain(`CUSTOMER:${event.subjectKey}`);
  });

  test("a failed topic pass never takes down the customer rewrite that already landed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({ text: "Prefers email." })
      .mockRejectedValueOnce(new Error("503"));

    await t.action(internal.wikiActions.rewriteCustomerPageAfterEvent, { companyId, ...event });

    const page = await customerPage(t, companyId);
    expect(page?.content).toBe("Prefers email.");
    // Nothing but the customer page was written.
    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
    expect(pages).toHaveLength(1);
  });
});
