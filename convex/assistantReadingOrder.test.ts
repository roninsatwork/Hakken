import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "./_generated/server";

/**
 * The wiki's page-picker starts first (assistant-foundation-plan.md, speed
 * S3, approved 2026-10-06): it reads only the question, the company and the
 * conversation, so it runs beside the search key and the document search
 * instead of waiting for them — measured at 0.9 s of every answer that reads
 * the wiki. Held by order, never by a clock: a stand-in server records which
 * call came first.
 */

const { order, searchKeyAsked } = vi.hoisted(() => {
  let resolve: () => void = () => {};
  const asked = new Promise<void>((done) => {
    resolve = done;
  });
  return { order: [] as string[], searchKeyAsked: { promise: asked, resolve: () => resolve() } };
});

vi.mock("./knowledgeRetrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeRetrieval")>();
  return {
    ...actual,
    embedRetrievalQuery: async () => {
      order.push("searchKey");
      searchKeyAsked.resolve();
      return null;
    },
  };
});

import { gatherReading } from "./assistantKnowledge";

describe("what is read for a question", () => {
  it("asks the wiki's page-picker before the search key is made, and reads its pages as before", async () => {
    let finishWiki: (pages: { context: string; pageKeys: string[] }) => void = () => {};
    const ctx = {
      runQuery: vi.fn(async () => null),
      runAction: vi.fn((reference: Parameters<typeof getFunctionName>[0]) => {
        order.push(getFunctionName(reference));
        return new Promise((resolve) => {
          finishWiki = resolve;
        });
      }),
      scheduler: { runAfter: vi.fn(async () => null) },
    } as unknown as ActionCtx;

    // No company: the platform's own conversation, answered from the wiki.
    const reading = gatherReading(ctx, {
      question: "What products does Hakken offer?",
      company: null,
      thread: null,
      allowance: "full",
      operation: "readingOrderTest",
    });

    await searchKeyAsked.promise;
    expect(order).toEqual(["wikiActions:selectWikiContextForQuery", "searchKey"]);

    finishWiki({ context: "Hakken offers Sites and Ask Hakken.", pageKeys: ["global/products"] });
    const read = await reading;
    expect(read.wikiPageKeys).toEqual(["global/products"]);
    expect(read.leading).toContain("Hakken offers Sites and Ask Hakken.");
  });
});
