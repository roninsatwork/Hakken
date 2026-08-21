import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The Contradiction Finder's action half (wiki-agents plan, phase 1). The
 * cluster and question machinery under it is tested through wikiQuestions;
 * what lives here is the sweep's self-gating — a stood-down finder spends
 * nothing, fewer than two pages of a kind never reach a model — and the
 * finder's ceiling: it raises questions, once per disagreement, and settles
 * nothing itself. Findings the model invents (unknown pages, a page against
 * itself) are discarded, questions the pages have already answered close
 * first, and a model call that throws must not wedge the round.
 *
 * The model is mocked at the aiProviderRegistry boundary, the same seam
 * gmailWatcher.test.ts uses. Nothing here contacts a real model.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

function makeTest() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() })
  );
}

async function seedModel(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("aiModels", {
      modelId: "test-model",
      providerKey: "google",
      providerModelId: "test-provider-model",
      displayName: "Test Model",
      isEnabled: true,
      isDefault: true,
      lastSyncedAt: Date.now(),
    });
  });
}

async function seedPolicyPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  subjectKey: string,
  content: string
) {
  await t.mutation(internal.wikiPages.applyRewriteInternal, {
    companyId,
    kind: "POLICY",
    subjectKey,
    title: subjectKey,
    content,
    source: "DOCUMENT:doc-1",
  });
}

async function standDown(t: ReturnType<typeof convexTest>, systemKey: string) {
  await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  await t.run(async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const agent = agents.find((candidate) => candidate.systemKey === systemKey);
    if (!agent) throw new Error(`No staff agent seeded for ${systemKey}`);
    await ctx.db.patch(agent._id, { isActive: false });
  });
}

async function staffRuns(t: ReturnType<typeof convexTest>, systemKey: string) {
  return await t.run(async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const agent = agents.find((candidate) => candidate.systemKey === systemKey);
    if (!agent) return [];
    const runs = await ctx.db.query("agentRuns").collect();
    return runs.filter((run) => run.agentId === agent._id);
  });
}

/** Two policy pages that state the same fact two incompatible ways. */
async function seedDisagreement(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>
) {
  await seedPolicyPage(t, companyId, "delivery-fast", "Delivery takes three days.");
  await seedPolicyPage(t, companyId, "delivery-slow", "Delivery takes two weeks.");
}

const FINDING = JSON.stringify({
  contradictions: [
    {
      pageA: "POLICY:delivery-fast",
      claimA: "Delivery takes three days.",
      pageB: "POLICY:delivery-slow",
      claimB: "Delivery takes two weeks.",
    },
  ],
});

afterEach(() => {
  generateMock.mockReset();
});

describe("the contradiction sweep's gates", () => {
  test("a stood-down finder spends nothing: no company gets a round", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await seedDisagreement(t, companyId);
    await standDown(t, "WIKI_CONTRADICTION_FINDER");

    await expect(t.action(internal.wikiContradictionActions.contradictionSweep, {})).resolves.toEqual(
      { companies: 0 }
    );
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("fewer than two pages of a kind never reach the model, and the quiet round is still recorded", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    // One page cannot disagree with itself.
    await seedPolicyPage(t, companyId, "delivery-fast", "Delivery takes three days.");

    const result = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });

    expect(result).toEqual({ raised: 0, autoResolved: 0 });
    expect(generateMock).not.toHaveBeenCalled();
    // A round that found nothing used to write nothing, so a working agent
    // and one that had never run looked identical on screen.
    const runs = await staffRuns(t, "WIKI_CONTRADICTION_FINDER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("nothing that disagrees");
  });
});

describe("the finder's findings", () => {
  test("a genuine disagreement is raised once, however many nights it stands — and never settled by the machine", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await seedDisagreement(t, companyId);
    generateMock.mockResolvedValue({ text: FINDING });

    const first = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });
    expect(first).toEqual({ raised: 1, autoResolved: 0 });

    // The next night, both claims still standing: the same disagreement is
    // not raised twice.
    const second = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });
    expect(second).toEqual({ raised: 0, autoResolved: 0 });

    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      kind: "CONTRADICTION",
      status: "OPEN",
      pageKeyA: "POLICY:delivery-fast",
      claimA: "Delivery takes three days.",
      pageKeyB: "POLICY:delivery-slow",
      claimB: "Delivery takes two weeks.",
    });
    // The pages themselves stand untouched: people settle truth.
    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
    expect(pages.map((page) => page.content).sort()).toEqual([
      "Delivery takes three days.",
      "Delivery takes two weeks.",
    ]);
  });

  test("findings naming unknown pages or a page against itself are discarded", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await seedDisagreement(t, companyId);
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        contradictions: [
          {
            pageA: "POLICY:invented",
            claimA: "x",
            pageB: "POLICY:delivery-slow",
            claimB: "y",
          },
          {
            pageA: "POLICY:delivery-fast",
            claimA: "x",
            pageB: "POLICY:delivery-fast",
            claimB: "y",
          },
        ],
      }),
    });

    const result = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });

    expect(result).toEqual({ raised: 0, autoResolved: 0 });
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(0);
  });

  test("questions the pages have already answered close first, so the list a person sees is never stale", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    // The page says three days; the standing question quotes a claim someone
    // has since edited away.
    await seedPolicyPage(t, companyId, "delivery", "Delivery takes three days.");
    await t.mutation(internal.wikiQuestions.raiseQuestionInternal, {
      companyId,
      kind: "CONTRADICTION",
      pageKeyA: "POLICY:delivery",
      claimA: "Delivery takes two weeks.",
      dedupeKey: "CONTRADICTION::stale",
    });

    const result = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });

    expect(result).toEqual({ raised: 0, autoResolved: 1 });
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0].status).toBe("RESOLVED");

    const runs = await staffRuns(t, "WIKI_CONTRADICTION_FINDER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("1 closed because the pages changed");
  });

  test("a model call that throws does not wedge the round: nothing is raised and the run is still recorded", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    await seedDisagreement(t, companyId);
    generateMock.mockRejectedValue(new Error("model unavailable"));

    const result = await t.action(internal.wikiContradictionActions.findContradictionsForCompany, {
      companyId,
    });

    expect(result).toEqual({ raised: 0, autoResolved: 0 });
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(0);

    const runs = await staffRuns(t, "WIKI_CONTRADICTION_FINDER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("nothing that disagrees");
  });
});
