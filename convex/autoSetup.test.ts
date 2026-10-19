import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { AUTO_SETUP } from "./utils/autoSetupAgent";

const { generate, fetchPage, streamTurn } = vi.hoisted(() => ({ generate: vi.fn(), fetchPage: vi.fn(), streamTurn: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));
vi.mock("./webScrapeActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./webScrapeActions")>()),
  fetchPage,
}));
vi.mock("./agentProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agentProviderRegistry")>()),
  isAgentCapableProvider: () => true,
  getAgentProviderAdapter: () => ({ streamTurn }),
}));

// Scheduled steps run only when a test finishes them, never by themselves mid-test.
beforeEach(() => {
  vi.useFakeTimers();
  fetchPage.mockReset().mockImplementation(async ({ url }: { url: string }) => ({
    status: "success",
    url,
    markdown: url.includes("nec.ac.uk") ? "National Extension College: GCSEs and A levels by distance learning, studied online from home with a tutor." : "Wolsey Hall Oxford: home schooling and distance learning.",
    links: url === "https://nec.ac.uk/" ? ["https://nec.ac.uk/about-us", "https://nec.ac.uk/a-levels", "https://nec.ac.uk/blog/news-1", "https://elsewhere.test/x"] : [],
    metadata: { title: url.includes("nec.ac.uk") ? "National Extension College" : "Wolsey Hall Oxford" },
  }));
  streamTurn.mockReset().mockResolvedValue({ text: "People call it National Extension College or NEC.", toolCalls: [], inputTokens: 200, outputTokens: 40, cachedInputTokens: 0, outcome: "COMPLETE" });
  generate.mockReset().mockImplementation(async ({ systemInstruction }: { systemInstruction: string }) => ({
    text: systemInstruction.startsWith("You name a business's rivals")
      ? JSON.stringify({ rivals: [{ website: "wolseyhalloxford.org.uk", names: ["Wolsey Hall Oxford"] }] })
      : JSON.stringify({
        names: [{ name: "National Extension College", kind: "NAME" }, { name: "NEC", kind: "NAME" }],
        sector: "Education: distance learning", market: "United Kingdom, online", description: "GCSEs and A levels studied online from home.",
        countries: ["gbr"], companyLine: "Distance learning college", companyAbout: "It teaches GCSEs and A levels by distance learning.",
        searches: [{ text: "online a level courses", from: "PAGES" }, { text: "national extension college", from: "OWN_NAME" }],
        questions: [{ text: "What is the best online college for A levels in the UK?", from: "WEB" }],
      }),
    inputTokens: 900,
    outputTokens: 300,
  }));
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Auto Setup (docs/plans/active/auto-setup-plan.md): started only by its
 * button, it fills only empty boxes, marks what it wrote as Hakken's with what
 * it was written from, keeps a person's words, and stops at its caps. The step
 * that reads pages and asks the model is not run here; its writes are.
 */

async function setUp() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { name: "Super Admin", email: "super@test.com", role: "SUPER_ADMIN", createdAt: now });
    const companyId = await ctx.db.insert("companies", { name: "National Extension College", createdAt: now });
    const ownSite = await ctx.db.insert("websites", { host: "nec.ac.uk", displayHost: "nec.ac.uk", firstSeenAt: now });
    const rivalSite = await ctx.db.insert("websites", { host: "wolseyhalloxford.org.uk", displayHost: "wolseyhalloxford.org.uk", firstSeenAt: now });
    const namedSite = await ctx.db.insert("websites", { host: "academy21.co.uk", displayHost: "academy21.co.uk", firstSeenAt: now });
    const own = await ctx.db.insert("companyWebsites", { companyId, websiteId: ownSite, relationship: "OWNED", createdAt: now });
    const rival = await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalSite, relationship: "TRACKED", againstWebsiteId: ownSite, createdAt: now });
    const named = await ctx.db.insert("companyWebsites", { companyId, websiteId: namedSite, relationship: "TRACKED", againstWebsiteId: ownSite, createdAt: now });
    return { userId, companyId, own, rival, named, ownSite };
  });
  return { t, ...ids, admin: t.withIdentity({ subject: ids.userId }) };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

const runRow = (t: Setup["t"], companyId: Id<"companies">) =>
  t.run(async (ctx) => await ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", companyId)).first());

describe("Auto Setup starts only from its button, for what is empty", () => {
  test("the button starts a run over the company's own websites, then its unnamed rivals", async () => {
    const { t, admin, companyId, own, rival, named } = await setUp();
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: named, names: [{ name: "Academy21", isPrimary: true }] });

    expect(await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId })).toBe("STARTED");

    const row = await runRow(t, companyId);
    expect(row?.status).toBe("WORKING");
    expect(row?.ownLeft).toEqual([own]);
    // The rival a person named is not asked about.
    expect(row?.rivalsLeft).toEqual([rival]);
    // Pieces of work for the page's bar: nec.ac.uk's pages, two web searches, its names and profile, two rivals'
    // rankings, its searches and questions — then the rival's home page read and its names written.
    expect([row?.pieces, row?.piecesDone]).toEqual([9, 0]);
    const { agent, run } = await t.run(async (ctx) => {
      const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", AUTO_SETUP.systemKey)).first();
      return { agent, run: row?.agentRunId ? await ctx.db.get(row.agentRunId) : null };
    });
    // Made with web search on, a cap a run and a day, and never waiting on approval (AS1, AS2).
    expect(agent).toMatchObject({ allowInternetAccess: true, maxCostUsd: 2, maxDailyCostUsd: 10, autonomousToolExecution: true, isActive: true });
    expect(run?.title).toBe("Auto Setup: National Extension College");

    // Pressed again while it works, it is left to work.
    expect(await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId })).toBe("GOING");
  });

  test("it does not start when switched off, past its cap for the day, or with nothing empty", async () => {
    const { t, admin, companyId } = await setUp();
    const agentId = await t.mutation(internal.autoSetupStart.ensureAutoSetupInternal, {});

    await t.run(async (ctx) => ctx.db.patch(agentId, { isActive: false }));
    expect(await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId })).toBe("AGENT_OFF");

    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { isActive: true });
      await ctx.db.insert("agentRuns", { agentId, triggerType: "EVENT", objective: "Earlier today", status: "SUCCESS", costUsd: 10, startedAt: Date.now(), updatedAt: Date.now() });
    });
    expect(await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId })).toBe("DAY_CAP");
  });

  test("a company with every box filled has nothing to start", async () => {
    const { t, admin, companyId, own, rival, named } = await setUp();
    for (const hold of [rival, named]) await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: hold, names: [{ name: "A rival", isPrimary: true }] });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: own, names: [{ name: "NEC", isPrimary: true }] });
    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, { companyWebsiteId: own, sector: "Education", marketLabel: "United Kingdom", description: "Distance learning." });
    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, { companyWebsiteId: own, keyword: "online a levels" });
    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, { companyWebsiteId: own, prompt: "Which online college is best for A levels?" });
    await admin.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: own, countries: ["gbr"] });
    await admin.mutation(api.companies.updateCompanyProfile, { id: companyId, name: "National Extension College", description: "A college", overview: "About it." });

    expect(await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId })).toBe("NOTHING");
    expect(await runRow(t, companyId)).toBeNull();
  });
});

describe("what it writes (AS4, AS5)", () => {
  test("only empty boxes, each marked with what it was written from, then the run moves on", async () => {
    const { t, admin, companyId, own } = await setUp();
    // A person's sector stays theirs.
    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, { companyWebsiteId: own, sector: "Further education", marketLabel: null, description: null });
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });
    const runId = (await runRow(t, companyId))!.agentRunId!;

    // Its names and profile first, straight after the web searches; the run stays on the website.
    const profileWrote = await t.mutation(internal.autoSetupSteps.writeOwnProfile, {
      companyId,
      runId,
      holdId: own,
      names: [{ name: "National Extension College", kind: "NAME" }, { name: "NEC", kind: "NAME" }, { name: "National Extention College", kind: "MISSPELLING" }],
      namesFrom: "PAGES_WEB:nec.ac.uk",
      sector: "Education: distance learning",
      market: "United Kingdom, online",
      description: "GCSEs and A levels studied online from home.",
      profileFrom: "PAGES:nec.ac.uk",
      countries: ["gbr"],
      countriesFrom: "PAGES:nec.ac.uk",
      companyLine: "Distance learning college",
      companyAbout: "It teaches GCSEs and A levels by distance learning.",
      companyFrom: "PAGES:nec.ac.uk",
    });
    expect(profileWrote).toEqual({ names: 3, profile: true, countries: ["gbr"], company: true });
    const midway = (await admin.query(api.autoSetupStart.autoSetupStatus, { companyId }))!.rows.find((row) => row.kind === "OWN")!;
    expect([midway.names, midway.profile, midway.countries, midway.searches, midway.questions]).toEqual(["HAKKEN", "HAKKEN", "HAKKEN", "WRITING", "WRITING"]);
    expect((await runRow(t, companyId))?.ownLeft).toEqual([own]);

    // Then its searches and questions, once the rivals' rankings are read; the run moves on.
    const listsWrote = await t.mutation(internal.autoSetupSteps.writeOwnLists, {
      companyId,
      runId,
      holdId: own,
      searches: [{ text: "online a level courses", from: "RIVALS:wolseyhalloxford.org.uk" }, { text: "national extension college", from: "OWN_NAME" }],
      questions: [{ text: "What is the best online college for A levels in the UK?", from: "WEB" }],
      webSearches: 2,
    });
    expect(listsWrote).toEqual({ searches: 2, questions: 1 });

    const profile = await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: own });
    expect(profile?.sector).toBe("Further education");
    expect(profile?.marketLabel).toBe("United Kingdom, online");
    expect(profile?.written).toEqual({ brandNames: "PAGES_WEB:nec.ac.uk", sector: null, marketLabel: "PAGES:nec.ac.uk", businessDescription: "PAGES:nec.ac.uk" });

    const searches = await admin.query(api.websiteClientView.listTrackedSearches, { companyWebsiteId: own, searchTerm: "", page: 1, pageSize: 15 });
    expect(searches.data.map((row) => [row.keyword, row.writtenFrom]).sort()).toEqual([
      ["national extension college", "OWN_NAME"],
      ["online a level courses", "RIVALS:wolseyhalloxford.org.uk"],
    ]);
    const questions = await admin.query(api.companyAiLists.listCompanyQuestions, { companyId, companyWebsiteId: own, searchTerm: "", page: 1, pageSize: 15 });
    expect(questions.data.map((row) => ({ byAutoSetup: row.byAutoSetup, writtenFrom: row.writtenFrom }))).toEqual([{ byAutoSetup: true, writtenFrom: "WEB" }]);

    const company = await admin.query(api.companies.getCompanyById, { id: companyId });
    expect(company?.hakkenWrote).toEqual({ description: "PAGES:nec.ac.uk", overview: "PAGES:nec.ac.uk" });
    // The page reads who filled each box, with how many Hakken wrote.
    const own2 = (await admin.query(api.autoSetupStart.autoSetupStatus, { companyId }))!.rows.find((row) => row.kind === "OWN")!;
    expect([own2.names, own2.namesCount, own2.profile, own2.searches, own2.searchesCount, own2.questions, own2.questionsCount, own2.countries])
      .toEqual(["HAKKEN", 3, "HAKKEN", "HAKKEN", 2, "HAKKEN", 1, "HAKKEN"]);
    const row = await runRow(t, companyId);
    expect(row?.ownLeft).toEqual([]);
    expect(row?.done).toBe(1);
    expect(row?.webSearches).toBe(2);
    expect(row?.wrote).toMatchObject({ ownNames: 3, profiles: 1, searches: 2, questions: 1, company: true, countries: ["gbr"] });
  });

  test("a person's change to a box takes Hakken's note off it, and only it", async () => {
    const { t, admin, companyId, own } = await setUp();
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });
    const runId = (await runRow(t, companyId))!.agentRunId!;
    await t.mutation(internal.autoSetupSteps.writeOwnProfile, {
      companyId, runId, holdId: own, names: [], namesFrom: "PAGES:nec.ac.uk",
      sector: "Education", market: "United Kingdom", description: "Distance learning.", profileFrom: "PAGES:nec.ac.uk",
      countries: ["gbr"], countriesFrom: "PAGES:nec.ac.uk", companyLine: "A college", companyAbout: "About it.", companyFrom: "PAGES:nec.ac.uk",
    });

    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, { companyWebsiteId: own, sector: "Further education", marketLabel: "United Kingdom", description: "Distance learning." });
    await admin.mutation(api.companies.updateCompanyProfile, { id: companyId, name: "National Extension College", description: "A charity college", overview: "About it." });
    await admin.mutation(api.searchConsoleCountries.setSearchConsoleCountries, { companyWebsiteId: own, countries: ["gbr", "irl"] });

    expect((await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: own }))?.written)
      .toEqual({ brandNames: null, sector: null, marketLabel: "PAGES:nec.ac.uk", businessDescription: "PAGES:nec.ac.uk" });
    expect((await admin.query(api.companies.getCompanyById, { id: companyId }))?.hakkenWrote).toEqual({ overview: "PAGES:nec.ac.uk" });
    expect((await admin.query(api.searchConsoleCountries.searchConsoleMarket, { companyWebsiteId: own }))?.writtenFrom).toBeNull();
  });

  test("a rival is named only while it still has no names", async () => {
    const { t, admin, companyId, rival, named } = await setUp();
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });
    const runId = (await runRow(t, companyId))!.agentRunId!;
    // A person names this one while the run works.
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: named, names: [{ name: "Academy21", isPrimary: true }] });

    const result = await t.mutation(internal.autoSetupSteps.writeRivalNames, {
      companyId,
      runId,
      handled: [rival, named],
      named: [
        { holdId: rival, names: [{ name: "Wolsey Hall Oxford", kind: "NAME" }], from: "HOME:wolseyhalloxford.org.uk" },
        { holdId: named, names: [{ name: "Academy 21 Online", kind: "NAME" }], from: "HOME:academy21.co.uk" },
      ],
    });

    expect(result).toEqual({ named: 1, kept: 1 });
    expect((await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: named }))?.brandNames.map((entry) => entry.name)).toEqual(["Academy21"]);
    expect((await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: rival }))?.written.brandNames).toBe("HOME:wolseyhalloxford.org.uk");
  });
});

describe("its run in Agents (AS11, decision 1)", () => {
  test("Agents' Run Agent does nothing and says where Auto Setup starts", async () => {
    const { t } = await setUp();
    const agentId = await t.mutation(internal.autoSetupStart.ensureAutoSetupInternal, {});
    const { runId, workflowExecutionId } = await t.run(async (ctx) => {
      const now = Date.now();
      const runId = await ctx.db.insert("agentRuns", { agentId, triggerType: "MANUAL", objective: "Run", status: "QUEUED", startedAt: now, updatedAt: now });
      return { runId, workflowExecutionId: await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "MANUAL", status: "RUNNING", startedAt: now }) };
    });

    await t.mutation(internal.autoSetupStart.answerAgentsRun, { runId, workflowExecutionId });

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("SUCCESS");
    expect(run?.finalOutput).toMatch(/starts from a company's Websites tab/);
  });

  test("a run whose last step was lost carries on, saying so", async () => {
    const { t, admin, companyId } = await setUp();
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });
    const row = (await runRow(t, companyId))!;
    await t.run(async (ctx) => ctx.db.patch(row._id, { lastStepAt: Date.now() - 60 * 60 * 1000 }));

    expect(await t.mutation(internal.autoSetupStart.carryOnStalled, {})).toBe(1);
    const lines = await t.run(async (ctx) => ctx.db.query("agentLogs").withIndex("by_run", (q) => q.eq("runId", row.agentRunId!)).collect());
    expect(lines.map((line) => line.interactionType)).toContain("Carried on");
  });

  test("the Websites tab reads what is empty, then what the run wrote", async () => {
    const { admin, companyId } = await setUp();
    const before = await admin.query(api.autoSetupStart.autoSetupStatus, { companyId });
    const boxes = (rows: NonNullable<typeof before>["rows"]) => rows.map((row) => [row.kind, row.name, row.names, row.profile, row.searches, row.questions, row.countries]);
    expect(boxes(before!.rows)).toEqual([
      ["COMPANY", "National Extension College", "NONE", "EMPTY", "NONE", "NONE", "NONE"],
      ["OWN", "nec.ac.uk", "EMPTY", "EMPTY", "EMPTY", "EMPTY", "EMPTY"],
      ["RIVAL", "wolseyhalloxford.org.uk", "EMPTY", "NONE", "NONE", "NONE", "NONE"],
      ["RIVAL", "academy21.co.uk", "EMPTY", "NONE", "NONE", "NONE", "NONE"],
    ]);
    expect(before?.rows.find((row) => row.kind === "RIVAL")?.against).toBe("nec.ac.uk");
    // What a run does at most, said before it is pressed.
    expect(before?.limits).toEqual({ pages: 6, webSearches: 10, searches: 25, questions: 10, runCapUsd: 2, dayCapUsd: 10 });
    expect(before?.run).toBeNull();

    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });
    const working = await admin.query(api.autoSetupStart.autoSetupStatus, { companyId });
    expect(working?.run).toMatchObject({ status: "WORKING", done: 0, total: 3, pieces: 9, piecesDone: 0, doing: null, costUsd: 0 });
    // The website the run is on now shows its empty boxes as being written, the company's description with it.
    expect(boxes(working!.rows).slice(0, 2)).toEqual([
      ["COMPANY", "National Extension College", "NONE", "WRITING", "NONE", "NONE", "NONE"],
      ["OWN", "nec.ac.uk", "WRITING", "WRITING", "WRITING", "WRITING", "WRITING"],
    ]);
  });
});

describe("a whole run, with the page reader, the web and the model stood in for", () => {
  test("it reads, searches, writes the own website and names the rivals, then says what is left for a person", async () => {
    const { t, admin, companyId, own, rival, named } = await setUp();
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: named, names: [{ name: "Academy21", isPrimary: true }] });
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });

    await finishScheduled(t);

    const row = await runRow(t, companyId);
    expect(row?.status).toBe("DONE");
    // Every piece of work counted, the rankings it had no way to buy among them, and nothing said as being done.
    expect([row?.piecesDone, row?.pieces, row?.doing]).toEqual([9, 9, undefined]);
    expect(row?.report).toMatch(/^Set up National Extension College: wrote 2 names for the company's own websites/);
    // It chose where the site trades, so a person is asked to check it.
    expect(row?.report).toContain("Still for a person: switch collection on in Schedules, connect Search Console, connect Google Analytics and check where it trades on Market.");
    expect((await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: own }))?.written.brandNames).toBe("PAGES_WEB:nec.ac.uk");
    expect((await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: rival }))?.brandNames.map((entry) => entry.name)).toEqual(["Wolsey Hall Oxford"]);
    // The home page and its two main pages; the blog post and the other website's page are not read.
    expect(fetchPage.mock.calls.map(([args]) => args.url).filter((url: string) => url.includes("nec.ac.uk"))).toEqual(["https://nec.ac.uk/", "https://nec.ac.uk/about-us", "https://nec.ac.uk/a-levels"]);
    const run = await t.run(async (ctx) => ctx.db.get(row!.agentRunId!));
    expect(run?.status).toBe("SUCCESS");
    // The model, the web searches and the page reads are each priced on the run.
    expect(run?.costUsd ?? 0).toBeGreaterThan(0);
  });

  test("it stops cleanly at its cap for a run, saying how to carry on", async () => {
    const { t, admin, companyId } = await setUp();
    const agentId = await t.mutation(internal.autoSetupStart.ensureAutoSetupInternal, {});
    await t.run(async (ctx) => ctx.db.patch(agentId, { maxCostUsd: 0.0001 }));
    await admin.mutation(api.autoSetupStart.startAutoSetup, { companyId });

    await finishScheduled(t);

    const row = await runRow(t, companyId);
    expect(row?.status).toBe("STOPPED");
    expect(row?.stopped).toMatch(/reached its spend cap for a run/);
  });
});

